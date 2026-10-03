import type { AppointmentsApi } from "../../appointments";
import type {
  Appointment,
  AvailabilitySession,
  BookingWindow,
  ClinicSessionSchedule,
  ClockTime,
  ISODateString,
  ParentAppointment,
  SessionPreset,
  UUID,
  VisitReason,
} from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import type { Database, Json } from "./database.types";
import { toApiError } from "./errors";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type SessionRow = Database["public"]["Tables"]["availability_sessions"]["Row"];

function mapAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    sessionId: row.session_id,
    childId: row.child_id,
    appointmentDate: row.appointment_date,
    visitReason: row.visit_reason,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapSession(row: SessionRow, bookedCount: number): AvailabilitySession {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    bookedCount,
  };
}

/** The `session_presets` setting, tolerating hand-edited JSON. */
function mapPresets(value: Json): SessionPreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { label, start, end } = item as Record<string, unknown>;
    return typeof label === "string" && typeof start === "string" && typeof end === "string"
      ? [{ label, startTime: start, endTime: end }]
      : [];
  });
}

const BOOKING_WINDOW_TTL_MS = 60_000;

export class SupabaseAppointmentsApi implements AppointmentsApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  /**
   * Nearly every screen asks for this first, before its own data. It only
   * changes at midnight or when the clinic edits its presets, so one answer
   * is shared for a minute (and callers asking together share one request).
   * A failed request isn't kept, so a signed-out first try doesn't stick.
   */
  getBookingWindow(): Promise<BookingWindow> {
    const cached = this.bookingWindow;
    if (cached && Date.now() - cached.at < BOOKING_WINDOW_TTL_MS) return cached.request;
    const request = this.fetchBookingWindow();
    this.bookingWindow = { at: Date.now(), request };
    request.catch(() => {
      if (this.bookingWindow?.request === request) this.bookingWindow = null;
    });
    return request;
  }

  private bookingWindow: { at: number; request: Promise<BookingWindow> } | null = null;

  private async fetchBookingWindow(): Promise<BookingWindow> {
    const { data, error } = await this.client.rpc("booking_window");
    if (error) throw toApiError(error, "BOOKING_WINDOW_FAILED");

    const row = data?.[0];
    if (!row) throw toApiError({ message: "NO_CLINIC_CONFIGURED" }, "NO_CLINIC_CONFIGURED");
    return {
      clinicId: row.clinic_id,
      today: row.today,
      fromDate: row.from_date,
      toDate: row.to_date,
      sessionPresets: mapPresets(row.session_presets),
    };
  }

  async listSessions(
    clinicId: UUID,
    fromDate: ISODateString,
    toDate: ISODateString
  ): Promise<AvailabilitySession[]> {
    const { data, error } = await this.client.rpc("appointment_sessions", {
      p_clinic_id: clinicId,
      p_from: fromDate,
      p_to: toDate,
    });
    if (error) throw toApiError(error, "SESSIONS_LIST_FAILED");

    return (data ?? []).map((row) => ({
      id: row.session_id,
      clinicId: row.clinic_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      bookedCount: row.booked_count,
    }));
  }

  async listMyAppointments(): Promise<ParentAppointment[]> {
    const { data, error } = await this.client.rpc("my_appointments");
    if (error) throw toApiError(error, "MY_APPOINTMENTS_FAILED");

    return (data ?? []).map((row) => ({
      appointmentId: row.appointment_id,
      childId: row.child_id,
      childName: row.child_name,
      sessionId: row.session_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      visitReason: row.visit_reason,
      status: row.status,
    }));
  }

  async book(input: {
    sessionId: UUID;
    childId: UUID;
    visitReason: VisitReason;
  }): Promise<Appointment> {
    const { data, error } = await this.client.rpc("book_appointment", {
      p_session_id: input.sessionId,
      p_child_id: input.childId,
      p_visit_reason: input.visitReason,
    });
    if (error) throw toApiError(error, "BOOK_APPOINTMENT_FAILED");
    return mapAppointment(data);
  }

  async listClinicSchedule(
    clinicId: UUID,
    fromDate: ISODateString,
    toDate: ISODateString
  ): Promise<ClinicSessionSchedule[]> {
    const { data, error } = await this.client.rpc("clinic_appointments", {
      p_clinic_id: clinicId,
      p_from: fromDate,
      p_to: toDate,
    });
    if (error) throw toApiError(error, "CLINIC_SCHEDULE_FAILED");

    // One row per booking (or one bookingless row per empty session) → group.
    const sessions = new Map<UUID, ClinicSessionSchedule>();
    for (const row of data ?? []) {
      let session = sessions.get(row.session_id);
      if (!session) {
        session = {
          sessionId: row.session_id,
          date: row.date,
          startTime: row.start_time,
          endTime: row.end_time,
          bookedCount: row.booked_count,
          appointments: [],
        };
        sessions.set(row.session_id, session);
      }
      if (row.appointment_id && row.appointment_status && row.child_id && row.visit_reason) {
        session.appointments.push({
          appointmentId: row.appointment_id,
          status: row.appointment_status,
          visitReason: row.visit_reason,
          childId: row.child_id,
          childName: row.child_name ?? "",
          childDob: row.child_dob ?? "",
          parentName: row.parent_name,
          parentPhone: row.parent_phone ?? "",
          tokenSeq: row.token_seq,
        });
      }
    }
    return [...sessions.values()];
  }

  async createSession(input: {
    clinicId: UUID;
    date: ISODateString;
    startTime: ClockTime;
    endTime: ClockTime;
  }): Promise<AvailabilitySession> {
    const { data, error } = await this.client.rpc("create_session", {
      p_clinic_id: input.clinicId,
      p_date: input.date,
      p_start_time: input.startTime,
      p_end_time: input.endTime,
    });
    if (error) throw toApiError(error, "CREATE_SESSION_FAILED");
    return mapSession(data, 0);
  }

  async cancelSession(sessionId: UUID): Promise<number> {
    const { data, error } = await this.client.rpc("cancel_session", {
      p_session_id: sessionId,
    });
    if (error) throw toApiError(error, "CANCEL_SESSION_FAILED");
    return data ?? 0;
  }

  async closeDay(clinicId: UUID, date: ISODateString): Promise<number> {
    const { data, error } = await this.client.rpc("close_day", {
      p_clinic_id: clinicId,
      p_date: date,
    });
    if (error) throw toApiError(error, "CLOSE_DAY_FAILED");
    return data ?? 0;
  }

  async copyWeek(
    clinicId: UUID,
    fromWeekStart: ISODateString,
    toWeekStart: ISODateString
  ): Promise<number> {
    const { data, error } = await this.client.rpc("copy_week", {
      p_clinic_id: clinicId,
      p_from_week_start: fromWeekStart,
      p_to_week_start: toWeekStart,
    });
    if (error) throw toApiError(error, "COPY_WEEK_FAILED");
    return data ?? 0;
  }
}

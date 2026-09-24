import type {
  Appointment,
  AvailabilitySession,
  BookingWindow,
  ClinicSessionSchedule,
  ClockTime,
  ISODateString,
  ParentAppointment,
  UUID,
  VisitReason,
} from "./types";

export interface AppointmentsApi {
  /** Today, the bookable range and the session presets, from clinic settings. */
  getBookingWindow(): Promise<BookingWindow>;
  /** Live sessions in a range (ones already over today left out). No personal data. */
  listSessions(
    clinicId: UUID,
    fromDate: ISODateString,
    toDate: ISODateString
  ): Promise<AvailabilitySession[]>;

  // --- Parent -------------------------------------------------------------

  /** Upcoming confirmed bookings, today onwards. */
  listMyAppointments(): Promise<ParentAppointment[]>;
  /**
   * Books a session for a child and a reason. Confirmed immediately (no
   * approval, no capacity); the doctor gets a notification. A booking is
   * permanent: nobody can cancel or move it.
   */
  book(input: { sessionId: UUID; childId: UUID; visitReason: VisitReason }): Promise<Appointment>;

  // --- Doctor -------------------------------------------------------------

  /** Every session in range with who booked it and why. */
  listClinicSchedule(
    clinicId: UUID,
    fromDate: ISODateString,
    toDate: ISODateString
  ): Promise<ClinicSessionSchedule[]>;
  /** Any times (end after start); throws INVALID_SESSION_TIMES or SESSION_OVERLAP. */
  createSession(input: {
    clinicId: UUID;
    date: ISODateString;
    startTime: ClockTime;
    endTime: ClockTime;
  }): Promise<AvailabilitySession>;
  /** Takes down a session nobody has booked; throws SESSION_HAS_BOOKINGS otherwise. */
  cancelSession(sessionId: UUID): Promise<void>;
  /** "Mark day closed" — only when none of that day's sessions has a booking. */
  closeDay(clinicId: UUID, date: ISODateString): Promise<void>;
  /** "Copy last week". Returns sessions created. */
  copyWeek(
    clinicId: UUID,
    fromWeekStart: ISODateString,
    toWeekStart: ISODateString
  ): Promise<number>;
}

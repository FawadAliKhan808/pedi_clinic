import type { Appointment, AvailabilitySession, ISODateString, UUID } from "./types";

export interface AppointmentsApi {
  /** Sessions within the (clinic-configured) booking window with `bookings < maxBookings`. */
  listOpenSessions(
    clinicId: UUID,
    fromDate: ISODateString,
    toDate: ISODateString
  ): Promise<AvailabilitySession[]>;

  book(input: { sessionId: UUID; childId: UUID }): Promise<Appointment>;
  reschedule(appointmentId: UUID, newSessionId: UUID): Promise<Appointment>;
  cancel(appointmentId: UUID): Promise<void>;
  listMyAppointments(): Promise<Appointment[]>;

  createSession(
    input: Omit<AvailabilitySession, "id" | "bookedCount">
  ): Promise<AvailabilitySession>;
  cancelSession(sessionId: UUID): Promise<void>;
  closeDay(clinicId: UUID, date: ISODateString): Promise<void>;
  copyWeek(
    clinicId: UUID,
    fromWeekStart: ISODateString,
    toWeekStart: ISODateString
  ): Promise<void>;
}

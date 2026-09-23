import type {
  Appointment,
  AvailabilitySession,
  BookingWindow,
  ClinicSessionSchedule,
  ClockTime,
  ISODateString,
  ParentAppointment,
  UUID,
} from "./types";

export interface AppointmentsApi {
  /** Today and the bookable range, computed server-side from clinic settings. */
  getBookingWindow(): Promise<BookingWindow>;
  /** Live sessions in a range with how many slots are taken. No personal data. */
  listSessions(
    clinicId: UUID,
    fromDate: ISODateString,
    toDate: ISODateString
  ): Promise<AvailabilitySession[]>;

  // --- Parent -------------------------------------------------------------

  listMyAppointments(): Promise<ParentAppointment[]>;
  /** Race-safe: throws `SESSION_FULL` rather than overbooking. */
  book(input: { sessionId: UUID; childId: UUID }): Promise<Appointment>;
  /** Parents are held to the booking window; the doctor isn't. */
  reschedule(appointmentId: UUID, newSessionId: UUID): Promise<Appointment>;
  /** No cutoff. When the doctor cancels, the parent is notified. */
  cancel(appointmentId: UUID): Promise<Appointment>;

  /**
   * Doctor decides a pending request; the parent is notified either way.
   * Decided exactly once — a second decision throws INVALID_APPOINTMENT_STATUS.
   */
  approve(appointmentId: UUID): Promise<Appointment>;
  reject(appointmentId: UUID): Promise<Appointment>;

  // --- Doctor -------------------------------------------------------------

  listClinicSchedule(
    clinicId: UUID,
    fromDate: ISODateString,
    toDate: ISODateString
  ): Promise<ClinicSessionSchedule[]>;
  createSession(input: {
    clinicId: UUID;
    date: ISODateString;
    startTime: ClockTime;
    endTime: ClockTime;
    maxBookings: number;
  }): Promise<AvailabilitySession>;
  updateSessionCapacity(sessionId: UUID, maxBookings: number): Promise<AvailabilitySession>;
  /** Cancels the session and its bookings, notifying each parent. Returns bookings affected. */
  cancelSession(sessionId: UUID): Promise<number>;
  /** "Mark day closed". Returns bookings affected. */
  closeDay(clinicId: UUID, date: ISODateString): Promise<number>;
  /** "Copy last week". Returns sessions created. */
  copyWeek(
    clinicId: UUID,
    fromWeekStart: ISODateString,
    toWeekStart: ISODateString
  ): Promise<number>;
}

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
   * approval, no capacity); the doctor gets a notification.
   */
  book(input: { sessionId: UUID; childId: UUID; visitReason: VisitReason }): Promise<Appointment>;
  /** Parents are held to the booking window; the doctor isn't. */
  reschedule(appointmentId: UUID, newSessionId: UUID): Promise<Appointment>;
  /** No cutoff. When the doctor cancels, the parent is notified. */
  cancel(appointmentId: UUID): Promise<Appointment>;

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

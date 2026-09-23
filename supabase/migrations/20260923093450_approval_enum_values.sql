-- Appointment approval workflow, part 1: new enum values.
--
-- Postgres won't let a new enum value be used in the same transaction that
-- adds it, so the values land here and the functions that use them follow in
-- the next migration.

-- A booking is now a request until the doctor decides. 'booked' remains the
-- approved state (shown to parents as "Confirmed").
alter type public.appointment_status add value if not exists 'pending' before 'booked';
alter type public.appointment_status add value if not exists 'rejected';

-- To the doctor: a parent asked for a slot. To the parent: the decision.
alter type public.notification_type add value if not exists 'booking_request';
alter type public.notification_type add value if not exists 'booking_update';

-- Parents are told when the doctor skips or removes their child's token.
-- (Enum values in their own migration: a new value can't be used in the
-- same transaction that adds it.)
alter type public.notification_type add value if not exists 'token_skipped';
alter type public.notification_type add value if not exists 'token_removed';

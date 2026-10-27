-- Who the course is written for: beginner | some | advanced. Existing courses keep "some" (their old behaviour).
alter table public.courses add column if not exists learner_level text not null default 'some' check (learner_level in ('beginner','some','advanced'));

-- Take a mover out of the dispatch pool while they are running a job.
--
-- `movers.is_available` is the mover's own online switch, and it is also the
-- flag dispatch filters on. Flipping it off on job acceptance therefore means
-- writing to a field the mover controls, and the restore on completion has to
-- know whether the flip was ours to undo.
--
-- This column answers that: it is set only when the accept path actually
-- changed `is_available` from true to false, and it names the booking that owes
-- the restore. A mover who was already offline when an admin assigned them, who
-- toggled themselves offline mid-job, or whom Aegis took offline for a
-- compliance violation has no hold recorded, so closing the booking leaves them
-- offline instead of forcing them back into the pool.
--
-- No FK: bookings.mover_id already points the other way, and a circular
-- constraint would only complicate table creation order for nothing.
ALTER TABLE movers
  ADD COLUMN IF NOT EXISTS auto_offline_booking_id varchar;

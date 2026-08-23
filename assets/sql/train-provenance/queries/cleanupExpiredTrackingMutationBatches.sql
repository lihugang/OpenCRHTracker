DELETE FROM tracking_mutation_batches
WHERE created_at < ?;

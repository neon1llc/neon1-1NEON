# Restoring the table

Point-in-time recovery restores the table as it was at a moment in the last 35 days. A restore taken
before a deletion brings the deleted account back, so redo deletions before anyone signs in.

1. Restore into a new table. Don't overwrite the live one.
2. From the live table, copy every `DELETED` row dated after the restore point, and every `PHONEHOLD`
   row. If the live table is gone, use the deletion receipts in the API logs (`prospect deleted`).
3. For each of those organizations, check whether its rows came back. If they did, start its deletion
   again as super: Delete under Potentials, or in the client's Settings, citing the original request.
4. Write the copied `PHONEHOLD` rows into the restored table, and check no queued `OUTBOX` row
   belongs to a deleted account.
5. Point the API at the restored table only after steps 3 and 4.

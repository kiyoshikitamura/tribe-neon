begin read only;
select exists(select 1 from pg_stat_activity where backend_xid::text='47143') as transaction_still_active,
       exists(select 1 from pg_locks where transactionid::text='47143') as transaction_locks_remain;
rollback;

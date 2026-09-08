-- Two more places an order can be in: on its way, and back again.
--
-- Placed rather than appended, so the enum's own order still reads as the
-- journey an order takes. Adding a value is allowed inside a transaction as
-- long as nothing uses it in the same one, and nothing here does.
ALTER TYPE "OrderStatus" ADD VALUE 'SHIPPED' BEFORE 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED' AFTER 'DELIVERED';

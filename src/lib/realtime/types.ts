import type { Table, Order } from "@/types";

export interface ServerEnvelope<T = any> {
  id: string;
  seq: number;
  type: string;
  ts: string;
  payload: T;
}

export interface ConnectionAckPayload {
  userId: string;
  role: "admin" | "waiter";
  allowedFloors: string[];
  serverTime: string;
  serverBootId: string;
  heartbeatSeconds: number;
}

export interface SubscribedPayload {
  floorId: string;
  tables: Table[];
}

export interface UnsubscribedPayload {
  floorId: string;
}

export interface TableUpdatedPayload {
  floorId: string;
  tableId: string;
  table: Table | null; // null if table was deleted or deactivated
}

export interface OrderUpdatedPayload {
  floorId: string;
  tableId: string;
  orderId: string;
  order: Order;
}

export interface BillPaidPayload {
  floorId: string;
  tableId: string;
  orderId: string;
  billNo: number | string;
  total: number;
  method: string;
}

export interface MenuChangedPayload {
  floorId: string;
}

export interface PrinterStatusPayload {
  printerId: string;
  state: "ok" | "error" | "warning";
  message?: string;
}

export interface PongPayload {
  clientTs: number;
}

export type ClientMessage =
  | { type: "subscribe"; floorId: string; id?: string }
  | { type: "unsubscribe"; floorId: string; id?: string }
  | { type: "ping"; clientTs: number; id?: string };

export type RealtimeStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export type EventListener<T = any> = (payload: T, envelope: ServerEnvelope<T>) => void;


import test from "node:test";
import assert from "node:assert/strict";
import { sortPriorityQueue } from "../services/priorityQueue.js";

test("Priority orders come before normal orders", () => {
  const orders = [
    { id: "A", status: "paid", priority: false, createdAt: 1000 },
    { id: "B", status: "paid", priority: true, createdAt: 2000 },
    { id: "C", status: "paid", priority: false, createdAt: 3000 },
    { id: "D", status: "paid", priority: true, createdAt: 4000 }
  ];

  const result = sortPriorityQueue(orders);

  assert.deepEqual(
    result.map(order => order.id),
    ["B", "D", "A", "C"]
  );
});

test("Orders with the same priority follow first-come, first-served", () => {
  const orders = [
    { id: "C", status: "paid", priority: true, createdAt: 3000 },
    { id: "A", status: "paid", priority: true, createdAt: 1000 },
    { id: "B", status: "paid", priority: true, createdAt: 2000 }
  ];

  const result = sortPriorityQueue(orders);

  assert.deepEqual(
    result.map(order => order.id),
    ["A", "B", "C"]
  );
});

test("Orders already preparing or completed are excluded", () => {
  const orders = [
    { id: "A", status: "preparing", priority: true, createdAt: 1000 },
    { id: "B", status: "paid", priority: false, createdAt: 2000 },
    { id: "C", status: "ready", priority: true, createdAt: 3000 },
    { id: "D", status: "collected", priority: false, createdAt: 4000 }
  ];

  const result = sortPriorityQueue(orders);

  assert.deepEqual(
    result.map(order => order.id),
    ["B"]
  );
});

test("Original orders array is not modified", () => {
  const orders = [
    { id: "A", status: "paid", priority: false, createdAt: 1000 },
    { id: "B", status: "paid", priority: true, createdAt: 2000 }
  ];

  sortPriorityQueue(orders);

  assert.deepEqual(
    orders.map(order => order.id),
    ["A", "B"]
  );
});
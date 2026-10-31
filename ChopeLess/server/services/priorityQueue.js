// ChopeLess Priority Queue Algorithm
// Owner: Janani
//
// Priority orders come first.
// Within each priority group, orders are first-come, first-served.
// Only paid orders waiting to be prepared belong in this queue.

function getTime(timestamp) {
  if (typeof timestamp === "number") {
    return timestamp;
  }

  // Firestore Timestamp object
  if (typeof timestamp?.toMillis === "function") {
    return timestamp.toMillis();
  }

  // Firestore timestamp stored as an object
  if (typeof timestamp?.seconds === "number") {
    return (
      timestamp.seconds * 1000 +
      Math.floor((timestamp.nanoseconds ?? 0) / 1000000)
    );
  }

  // Date string or JavaScript Date
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  if (typeof timestamp === "string") {
    return new Date(timestamp).getTime() || 0;
  }

  return 0;
}

export function sortPriorityQueue(orders) {
  return orders
    .filter(order => order.status === "paid")
    .sort((a, b) => {
      // Priority orders first
      if (Boolean(a.priority) !== Boolean(b.priority)) {
        return Number(Boolean(b.priority)) - Number(Boolean(a.priority));
      }

      // Earlier order first
      return getTime(a.createdAt) - getTime(b.createdAt);
    });
}

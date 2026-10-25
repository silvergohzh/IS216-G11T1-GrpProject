// Browser notifications (the pop-ups outside the page, like a chat app). Owner: M6
// The browser asks the user for permission once. If they say no, we only show
// the in-app pop-ups (components/OrderAlerts.vue).

// Ask for permission. Call this after the user clicks something (browsers require that).
export function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

// Show a notification, if the user allowed them
export function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body, icon: '/favicon.svg' })
  }
}

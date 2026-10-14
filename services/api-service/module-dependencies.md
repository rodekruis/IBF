# Module Dependencies Graph

```mermaid
graph LR
  AlertsModule-->EventsModule
  AlertsModule-->NotificationsModule
  EventsModule-->AlertConfigsModule
  NotificationsModule-->EventsModule
```

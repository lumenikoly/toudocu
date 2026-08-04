# Архитектура Service Desk

- Тип документа: Architecture Overview

Service Desk принимает обращения пользователя через браузер, сохраняет их в
управляемом backend и может перевести пользователя во внешний Support Center.
Пользователь и Support Center находятся за границей управляемой системы.

## Граница системы

Внутри Service Desk находятся Web Frontend, Backend API и PostgreSQL. Frontend
является публичной точкой пользовательского взаимодействия, Backend API —
единственной точкой бизнес-операций, а PostgreSQL доступна только backend.
Support Center связан внешней HTTPS-навигацией и не получает содержимое
обращения.

## Карта архитектурных вопросов

- [Какие стороны взаимодействуют с Service Desk и где проходит системная граница?](system-context.md)
- [Как компоненты Service Desk делят ответственность?](component-model.md)
- [Кто владеет данными обращения и их изменением?](data-ownership.md)
- [Где проходят границы доверия Service Desk?](trust-boundaries.md)
- [Как компоненты размещаются в целевой топологии MVP?](deployment-topology.md)

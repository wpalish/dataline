import {
  F,
  S,
  R,
  C,
  live,
  rows,
  byId,
  unique,
  required,
  minor,
  amount,
  interval,
  noOverlap,
  changed,
  immutable,
  admin,
  totalLines,
  summary,
  clock,
  label,
} from "./core/rules.js";
const definition = {
  slug: "dataline",
  reference: 18,
  title: "DataLine",
  description: "Таблица деловых контактов и связанных следующих действий.",
  limitations:
    "Одна организация · Собственный сервер · Ручной ввод · Без банковских и внешних интеграций",
  collections: [
    C("contacts", "Контакты", [
      F("name", "Компания или контакт"),
      F("email", "Деловая почта", "email"),
      F("company", "Организация"),
      S("status", "Статус", [
        ["active", "Активен"],
        ["paused", "Пауза"],
      ]),
    ]),
    C("actions", "Следующие действия", [
      R("contact", "Контакт", "contacts"),
      F("task", "Задача"),
      F("due", "Срок", "date"),
      S("status", "Статус", [
        ["open", "Открыто"],
        ["done", "Выполнено"],
      ]),
    ]),
  ],
  validate(state, before, command, actor) {
    unique(live(state, "contacts"), "email", "Почта");
    for (const action of live(state, "actions"))
      if (action.status === "open")
        required(
          !byId(state, "contacts", action.contact).archived,
          "Сначала завершите открытые действия контакта.",
        );
    for (const contact of rows(state, "contacts"))
      if (contact.archived)
        required(
          !live(state, "actions").some(
            (x) => x.contact === contact.id && x.status === "open",
          ),
          "Сначала завершите открытые действия контакта.",
        );
  },
  summarize(state) {
    return live(state, "contacts").map((x) =>
      summary(
        x.name,
        ...live(state, "actions")
          .filter((a) => a.contact === x.id && a.status === "open")
          .map(
            (a) =>
              a.task +
              " · " +
              a.due +
              (a.due < new Date().toISOString().slice(0, 10)
                ? " · Срок прошёл"
                : ""),
          ),
      ),
    );
  },
};
export default definition;

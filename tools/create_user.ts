#!/usr/bin/env node
// Создать пользователя (первого админа или обычного) — печатает SQL для Supabase → SQL Editor.
// Пароль в SQL не попадает — только хеш PBKDF2 (тот же код, что у сайта: web/worker/passwords.ts).
//
//   node tools/create_user.ts            # админ (первый вход в админ-панель)
//   node tools/create_user.ts --user     # обычный пользователь (пока нет админ-панели)
//
// Нужен Node 22.18+ (запускает .ts без сборки). Имя и пароль спрашиваются в Терминале, пароль не виден при вводе.
// Потом: Supabase → проект → SQL Editor → вставить напечатанный SQL → Run. Обычно — сначала в тестовом проекте.
import { createInterface } from "node:readline";
import { hashPassword, passwordProblem, usernameProblem } from "../web/worker/passwords.ts";

const role = process.argv.includes("--user") ? "user" : "admin";

// Один readline на все вопросы (иначе при вставке нескольких строк сразу ответы теряются).
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();
let muted = false;                                   // пароль не показываем при вводе
const output = rl as unknown as { _writeToOutput: (s: string) => void };
const original = output._writeToOutput.bind(rl);
output._writeToOutput = (s: string) => { if (!muted) original(s); };

/** Вопрос в Терминале; hidden — не показывать вводимое (для пароля). */
async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const { value } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return value ?? "";
}

const username = (await ask(`Имя (${role === "admin" ? "админ" : "пользователь"}; латиница, цифры, _; регистр важен): `)).trim();
const nameProblem = usernameProblem(username);
if (nameProblem) { console.error("⚠ " + nameProblem); rl.close(); process.exit(1); }

const password = await ask("Пароль (не виден при вводе): ", true);
const repeat = await ask("Повтор пароля: ", true);
const problem = passwordProblem(password, repeat);
if (problem) { console.error("⚠ " + problem); rl.close(); process.exit(1); }

rl.close();
const { hash, salt, iterations } = await hashPassword(password);
console.log(`
-- Вставить в Supabase → SQL Editor → Run. Пароля здесь нет — только хеш. Имя «${username}» должно быть свободно.
insert into public.users (username, password_hash, password_salt, password_iterations, role)
values ('${username}', '${hash}', '${salt}', ${iterations}, '${role}');
`);

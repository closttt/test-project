/**
 * «Индекс» · Система — the living design-system page: principles, colour, type, components and
 * graphics, rendered from the same kit the screens use (so it can't drift from them).
 */
import { useState, type ReactNode } from "react";

import {
  B,
  T,
  tab,
  Page,
  PageHeader,
  SectionHead,
  Stats,
  Line,
  Tag,
  Empty,
  Check,
  Button,
  Hook,
  Signal,
  KV,
  NumTabs,
  Chip,
  CtaBar,
  PIX,
  TopoLines,
  DotField,
  DitherField,
  AsciiField,
} from "@/design-lab/screens/_kit/index";

const PRINCIPLES = [
  ["Один лайм на экран", "Лаймовым бывает только главное действие или маркер «сейчас». Всё остальное — белый и серый."],
  ["Цифры вместо иконок", "Разделы, секции и строки нумеруются 01, 02… Иконка — только там, где без неё непонятно."],
  ["Линии вместо карточек", "Глубину дают волосяные линии с альфой 5–40% и плоскость чёрного; радиус — 0."],
  ["Крупный заголовок, тихая мета", "Заголовки Golos 500 с плотным трекингом, всё служебное — 12px серым."],
  ["Одна графика на раздел", "Топо-линии, дизер, поле точек или ASCII — мягко, в шапке, под маской."],
];

const SURFACES: [string, string][] = [
  ["bg", B.bg],
  ["body", B.body],
  ["s1", B.s1],
  ["s2", B.s2],
  ["s3", B.s3],
  ["s4", B.s4],
];
const LINES: [string, string][] = [
  ["l5", B.l5],
  ["l7", B.l7],
  ["l10", B.l10],
  ["l15", B.l15],
  ["l20", B.l20],
  ["l25", B.l25],
  ["l40", B.l40],
];
const TEXTS: [string, string][] = [
  ["text", B.text],
  ["text2", B.text2],
  ["text3", B.text3],
  ["off", B.off],
];
const ACCENTS: [string, string, string][] = [
  ["lime", B.lime, "действие · сейчас"],
  ["danger", B.danger, "просрочка · риск"],
  ["warn", B.warn, "внимание"],
];

const TYPE: [keyof typeof T, string][] = [
  ["displayXl", "Добрый день"],
  ["displayL", "48 открыто"],
  ["displayM", "План дня"],
  ["displayS", "Проекты"],
  ["title", "Сайт вебинара + запуск"],
  ["bodyL", "Созвон с Даней и Катей в 14:00"],
  ["body", "Мысль, ссылка, итог созвона"],
  ["meta", "24 с просрочкой · серия 0 дней"],
  ["caps", "Время сегодня"],
];

export default function System() {
  const [done, setDone] = useState(false);
  const [tabId, setTabId] = useState<"a" | "b" | "c">("a");

  return (
    <Page>
      <PageHeader
        title="Система «Индекс»"
        deck="Минималистичная версия «Редакционного индекса»: язык сайта alexandrbondar.com, переведённый в продукт. Всё на этой странице отрисовано теми же компонентами, что и экраны."
        graphic="ascii"
        seed={9}
      />

      <Block n="01" title="Принципы">
        <ol style={{ borderTop: `1px solid ${B.l10}` }}>
          {PRINCIPLES.map(([h, d], i) => (
            <li key={h} className="grid grid-cols-[48px_280px_minmax(0,1fr)] items-baseline gap-5 py-5" style={{ borderBottom: `1px solid ${B.l7}` }}>
              <span style={{ ...T.num, color: B.off }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={T.title}>{h}</span>
              <span style={{ ...T.body, color: B.text2 }}>{d}</span>
            </li>
          ))}
        </ol>
      </Block>

      <Block n="02" title="Цвет">
        <div className="grid grid-cols-4 gap-5">
          <Swatches title="Поверхности" items={SURFACES} />
          <Swatches title="Линии (белый, альфа)" items={LINES} line />
          <Swatches title="Текст" items={TEXTS} text />
          <div>
            <Label>Смысл</Label>
            {ACCENTS.map(([k, c, d]) => (
              <div key={k} className="flex items-center gap-3 py-2.5" style={{ borderBottom: `1px solid ${B.l7}` }}>
                <span className="h-6 w-6" style={{ background: c }} />
                <span style={T.body}>{k}</span>
                <span className="ml-auto" style={{ ...T.meta, color: B.text3 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </Block>

      <Block n="03" title="Типографика" meta="Golos Text · без Panama">
        <div style={{ borderTop: `1px solid ${B.l10}` }}>
          {TYPE.map(([k, sample]) => {
            const s = T[k];
            return (
              <div key={k} className="grid grid-cols-[160px_minmax(0,1fr)_200px] items-center gap-5 py-4" style={{ borderBottom: `1px solid ${B.l7}` }}>
                <span style={{ ...T.meta, color: B.text3 }}>{k}</span>
                <span className="truncate" style={s}>{sample}</span>
                <span className="text-right" style={{ ...T.meta, color: B.off, ...tab }}>
                  {s.fontSize}px · {s.fontWeight} · {String(s.letterSpacing)}
                </span>
              </div>
            );
          })}
        </div>
      </Block>

      <Block n="04" title="Компоненты">
        <div className="grid grid-cols-4 gap-x-5 gap-y-12">
          <Spec title="Кнопки">
            <div className="flex flex-col items-start gap-3">
              <Button>Новая задача</Button>
              <Button variant="outline">Сохранить</Button>
              <Button variant="ghost">Отмена</Button>
            </div>
          </Spec>
          <Spec title="Строка задачи">
            <div className="flex h-14 items-center gap-4" style={{ borderTop: `1px solid ${B.l7}`, borderBottom: `1px solid ${B.l7}` }}>
              <span style={{ ...T.num, color: B.off }}>01</span>
              <Check done={done} onClick={() => setDone((v) => !v)} label="Пример" />
              <span className="flex-1 truncate" style={{ ...T.bodyL, color: done ? B.text4 : B.text, textDecoration: done ? "line-through" : undefined }}>
                Нажми на квадрат
              </span>
              <Signal value={3} on={B.text2} />
            </div>
          </Spec>
          <Spec title="Метки и прогресс">
            <div className="flex flex-wrap gap-2">
              <Tag>Axevil</Tag>
              <Tag color={B.danger}>Сорвано</Tag>
              <Chip icon={PIX.chipCal}>Воскресенье, 11 октября</Chip>
            </div>
            <div className="mt-5 flex flex-col gap-4">
              <Line pct={72} color={B.text2} />
              <Line pct={94} color={B.danger} />
            </div>
          </Spec>
          <Spec title="Ввод">
            <div className="flex h-12 items-center gap-3" style={{ borderBottom: `1px solid ${B.l15}` }}>
              <span style={{ color: B.text3 }}>
                <Hook size={14} />
              </span>
              <input placeholder="Добавить — «созвон завтра 15:00»" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#454545]" style={{ ...T.body, color: B.text }} />
            </div>
          </Spec>
          <Spec title="Вкладки" wide>
            <NumTabs
              items={[
                { id: "a", label: "Список", count: 24 },
                { id: "b", label: "Канбан" },
                { id: "c", label: "Архив" },
              ]}
              value={tabId}
              onChange={setTabId}
            />
          </Spec>
          <Spec title="Свойства (KV)" wide>
            <KV k="Проект" v="Axevil" py={10} />
            <KV k="Срок" v={<span style={{ color: B.danger }}>05 окт.</span>} py={10} />
            <KV k="Время" v="0 мин" py={10} last />
          </Spec>
          <Spec title="KPI" wide2>
            <Stats
              items={[
                { k: "Сегодня", v: "0/24", sub: "24 просрочено", hot: true },
                { k: "Открыто", v: 48, sub: "24 с просрочкой" },
                { k: "За неделю", v: 3, sub: "серия 0 дней" },
              ]}
            />
          </Spec>
          <Spec title="Главное действие панели" wide2>
            <CtaBar tone="lime">Готово</CtaBar>
          </Spec>
          <Spec title="Пустое состояние">
            <Empty title="Встреч нет" text="День целиком под план." seed={11} />
          </Spec>
        </div>
      </Block>

      <Block n="05" title="Графика" meta="одна на раздел · в шапке · под маской">
        <div className="grid grid-cols-4 gap-5">
          {[
            ["topo", "Топо-линии", "refs 22 · 25"],
            ["orb", "Дизер-сфера", "сайт · ref 16"],
            ["dots", "Поле точек", "ref 16"],
            ["ascii", "ASCII", "сайт"],
          ].map(([k, name, src]) => (
            <div key={k}>
              <div className="relative h-[180px] overflow-hidden" style={{ boxShadow: `inset 0 0 0 1px ${B.l10}` }}>
                {k === "topo" && <TopoLines seed={3} className="absolute inset-0 h-full w-full" color="rgba(255,255,255,0.16)" />}
                {k === "orb" && <DitherField kind="orb" seed={11} color="rgba(255,255,255,0.6)" cell={5} dot={2} className="absolute inset-0" />}
                {k === "dots" && <DotField className="absolute inset-0" color="rgba(255,255,255,0.3)" />}
                {k === "ascii" && <AsciiField kind="wave" seed={9} color="rgba(255,255,255,0.35)" className="absolute inset-0" />}
              </div>
              <div className="mt-3 flex justify-between">
                <span style={T.body}>{name}</span>
                <span style={{ ...T.meta, color: B.text3 }}>{src}</span>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block n="06" title="Сетка">
        <div className="grid grid-cols-3 gap-5" style={{ borderTop: `1px solid ${B.l10}` }}>
          <KV k="Колонки" v="4" py={12} />
          <KV k="Поля страницы" v="40 px" py={12} />
          <KV k="Гаттер" v="20 px" py={12} />
          <KV k="Сайдбар" v="220 px" py={12} />
          <KV k="Линии колонок" v="4.5% · гаснут книзу" py={12} />
          <KV k="Радиус" v="0" py={12} />
        </div>
      </Block>
    </Page>
  );
}

function Block({ n, title, meta, children }: { n: string; title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="mt-20 first-of-type:mt-6">
      <SectionHead n={n} title={title} meta={meta} />
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-3" style={{ ...T.meta, color: B.text3 }}>{children}</div>;
}

function Spec({ title, children, wide, wide2 }: { title: string; children: ReactNode; wide?: boolean; wide2?: boolean }) {
  return (
    <div className={wide2 ? "col-span-2" : wide ? "col-span-2" : ""}>
      <Label>{title}</Label>
      {children}
    </div>
  );
}

function Swatches({ title, items, line, text }: { title: string; items: [string, string][]; line?: boolean; text?: boolean }) {
  return (
    <div>
      <Label>{title}</Label>
      {items.map(([k, c]) => (
        <div key={k} className="flex items-center gap-3 py-2.5" style={{ borderBottom: `1px solid ${B.l7}` }}>
          {line ? (
            <span className="h-6 w-6" style={{ boxShadow: `inset 0 0 0 1px ${c}` }} />
          ) : text ? (
            <span className="flex h-6 w-6 items-center justify-center" style={{ ...T.bodyStrong, color: c }}>Аа</span>
          ) : (
            <span className="h-6 w-6" style={{ background: c, boxShadow: `inset 0 0 0 1px ${B.l10}` }} />
          )}
          <span style={T.body}>{k}</span>
          <span className="ml-auto" style={{ ...T.meta, color: B.off }}>{c}</span>
        </div>
      ))}
    </div>
  );
}

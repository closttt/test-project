import { Page, PageHeader, B, T } from "@/design-lab/screens/_kit/index";

/** Placeholder until the section is built. */
export function Stub({ title }: { title: string }) {
  return (
    <Page>
      <PageHeader title={title} deck="Раздел собирается в системе «Индекс»." graphic="dots" />
      <p style={{ ...T.body, color: B.text3 }}>Скоро здесь будет экран.</p>
    </Page>
  );
}

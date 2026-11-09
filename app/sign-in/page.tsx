import CollegeBrand from "../CollegeBrand";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="loading-screen">
    <CollegeBrand variant="standalone"/>
    <h1>Вхід до журналу</h1>
    <form className="panel sign-in-form" action="/api/session" method="post">
      <label className="field">
        <span>Електронна пошта</span>
        <input type="email" name="email" maxLength={254} autoComplete="username" required/>
      </label>
      <label className="field">
        <span>Код доступу</span>
        <input type="password" name="key" maxLength={36} autoComplete="current-password" required/>
      </label>
      {error === "invalid" && <p role="alert">Перевірте електронну пошту та код доступу.</p>}
      {error === "setup" && <p role="alert">Вхід ще не налаштовано. Зверніться до адміністратора журналу.</p>}
      <button type="submit" className="button primary">Увійти</button>
    </form>
  </main>;
}

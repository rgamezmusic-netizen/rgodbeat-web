import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { Navbar, Footer } from "@/components/layout";

export default async function SupabaseTestPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Test query to Supabase
  const { data: testData, error } = await supabase.from("todos").select();

  return (
    <div className="min-h-screen bg-[#08080a] text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      <Navbar />

      <main className="flex-1 pt-36 pb-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-xs font-mono text-purple-300">
            <span>⚡ SUPABASE CONNECTION TEST</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Supabase Client Status
          </h1>
          <p className="text-sm text-zinc-400">
            Connected to project URL: <code className="text-purple-300 font-mono text-xs">{process.env.NEXT_PUBLIC_SUPABASE_URL}</code>
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-[#0e0e13] border border-white/[0.08] space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Query Result: Table &apos;todos&apos;
          </h2>

          {error ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-200">
              <span className="font-bold">Notice:</span> {error.message} (This is normal if the &apos;todos&apos; table has not been created yet in your Supabase dashboard).
            </div>
          ) : testData && testData.length > 0 ? (
            <ul className="space-y-2 text-sm font-mono text-zinc-300">
              {testData.map((todo: { id: string | number; name: string }) => (
                <li key={todo.id} className="p-2 rounded bg-white/[0.03] border border-white/[0.06]">
                  {todo.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs font-mono text-zinc-400 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              Connected successfully! Table returned 0 rows (empty dataset).
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

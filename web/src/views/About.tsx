import { Badge } from "../components/app/shared";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";

export function About() {
  return (
    <div className="flex w-full max-w-[1480px] flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-faint)]">About</span>
          <h1 className="m-0 text-3xl font-semibold leading-9 tracking-tight">Cavoti Bar</h1>
        </div>
        <Badge variant="outline">Baseline</Badge>
      </div>
      <Card className="gap-3 rounded-xl border border-[var(--line)] bg-white/75 p-3 shadow-sm">
        <CardHeader className="flex items-center gap-3 p-0">
          <img className="size-11 object-contain" src="./cavoti-logo.png" alt="Cavoti logo" />
          <CardTitle className="text-xl font-semibold leading-7">Private usage at a glance</CardTitle>
        </CardHeader>
        <CardContent className="p-0 text-sm leading-5 text-[var(--ink-muted)]">
          <p className="m-0">
            Cavoti Bar reads aggregate plan and usage data through an authenticated Cavoti browser profile. Credentials never enter the
            renderer.
          </p>
        </CardContent>
        <Separator />
        <CardFooter className="flex justify-between border-t bg-transparent p-0 pt-3 text-[10px] text-[var(--ink-faint)]">
          <span>Built for Cavoti</span>
          <span>Local WebView2 session</span>
        </CardFooter>
      </Card>
    </div>
  );
}

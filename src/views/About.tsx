import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Separator } from "../components/ui/separator";

export function About() {
  return (
    <div className="flex w-full max-w-370 flex-col gap-4">
      <Card className="gap-3 rounded-xl border border-(--line) bg-white/75 p-3 shadow-sm">
        <CardHeader className="flex items-center gap-3 p-0">
          <img
            className="size-11 object-contain"
            src="./cavoti-logo.png"
            alt="Cavoti Bar logo"
          />
          <CardTitle className="text-xl font-semibold leading-7">
            Private usage at a glance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 text-sm leading-5 text-(--ink-muted)">
          <p className="m-0">
            Cavoti Bar reads aggregate plan and usage data through an
            authenticated Cavoti browser profile. Credentials never enter the
            renderer.
          </p>
        </CardContent>
        <Separator />
        <CardFooter className="flex justify-between border-t bg-transparent p-0 pt-3 text-[10px] text-(--ink-faint)">
          <span>Built for Cavoti</span>
          <span>Local Cavoti session</span>
        </CardFooter>
      </Card>
    </div>
  );
}

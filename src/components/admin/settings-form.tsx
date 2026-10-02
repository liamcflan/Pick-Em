"use client";

import { useActionState } from "react";

import {
  TIMEZONES,
  updateSettings,
  type SettingsActionState,
} from "@/app/(app)/admin/settings/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type SettingsValues = {
  spreadLockDay: number;
  spreadLockTime: string;
  timezone: string;
  defaultStartingBalanceDollars: number;
  betUnitDollars: number;
  hidePicksUntilKickoff: boolean;
};

const selectClass =
  "border-input bg-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none";

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action] = useActionState<SettingsActionState, FormData>(updateSettings, {});
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="spreadLockDay">Lines lock on</Label>
          <select
            id="spreadLockDay"
            name="spreadLockDay"
            defaultValue={values.spreadLockDay}
            className={selectClass}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="spreadLockTime">At (site time)</Label>
          <Input
            id="spreadLockTime"
            name="spreadLockTime"
            type="time"
            defaultValue={values.spreadLockTime}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Site timezone</Label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={values.timezone}
            className={selectClass}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Deadlines are 11:59 PM in this zone the night before each game.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="defaultStartingBalanceDollars">Default starting balance ($)</Label>
          <Input
            id="defaultStartingBalanceDollars"
            name="defaultStartingBalanceDollars"
            type="number"
            min={1}
            max={1000000}
            step={1}
            defaultValue={values.defaultStartingBalanceDollars}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="betUnitDollars">Bet unit ($)</Label>
          <Input
            id="betUnitDollars"
            name="betUnitDollars"
            type="number"
            min={1}
            max={100000}
            step={1}
            defaultValue={values.betUnitDollars}
            required
          />
          <p className="text-muted-foreground text-xs">
            Wagers are whole multiples of this. The rules say 1,000.
          </p>
        </div>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            name="hidePicksUntilKickoff"
            defaultChecked={values.hidePicksUntilKickoff}
            className="size-4 accent-current"
          />
          Hide other members&rsquo; picks until each game locks
        </label>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
    </form>
  );
}

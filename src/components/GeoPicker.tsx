import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GeoState { code: string; name: string }
interface GeoDistrict { id: string; state_code: string; name: string }
interface GeoLocality { id: string; district_id: string; name: string; kind: string }

export interface GeoSelection {
  stateCode: string | null;
  stateName: string | null;
  districtId: string | null;
  districtName: string | null;
  localityId: string | null;
  localityName: string | null;
}

export function GeoPicker({
  value,
  onChange,
  defaultStateCode = "UP",
}: {
  value: GeoSelection;
  onChange: (v: GeoSelection) => void;
  defaultStateCode?: string;
}) {
  const [states, setStates] = useState<GeoState[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [localities, setLocalities] = useState<GeoLocality[]>([]);

  useEffect(() => {
    supabase.from("geo_states").select("*").order("name").then(({ data }) => {
      setStates((data ?? []) as GeoState[]);
    });
  }, []);

  useEffect(() => {
    if (!value.stateCode) {
      setDistricts([]);
      return;
    }
    supabase
      .from("geo_districts")
      .select("*")
      .eq("state_code", value.stateCode)
      .order("name")
      .then(({ data }) => setDistricts((data ?? []) as GeoDistrict[]));
  }, [value.stateCode]);

  useEffect(() => {
    if (!value.districtId) {
      setLocalities([]);
      return;
    }
    supabase
      .from("geo_localities")
      .select("*")
      .eq("district_id", value.districtId)
      .order("name")
      .then(({ data }) => setLocalities((data ?? []) as GeoLocality[]));
  }, [value.districtId]);

  // default state on first mount
  useEffect(() => {
    if (!value.stateCode && states.length && defaultStateCode) {
      const s = states.find((x) => x.code === defaultStateCode);
      if (s) onChange({ ...value, stateCode: s.code, stateName: s.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states.length]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">State</Label>
        <Select
          value={value.stateCode ?? undefined}
          onValueChange={(code) => {
            const s = states.find((x) => x.code === code);
            onChange({
              stateCode: code,
              stateName: s?.name ?? null,
              districtId: null,
              districtName: null,
              localityId: null,
              localityName: null,
            });
          }}
        >
          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
          <SelectContent>
            {states.map((s) => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">District</Label>
        <Select
          value={value.districtId ?? undefined}
          onValueChange={(id) => {
            const d = districts.find((x) => x.id === id);
            onChange({
              ...value,
              districtId: id,
              districtName: d?.name ?? null,
              localityId: null,
              localityName: null,
            });
          }}
          disabled={!value.stateCode || districts.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={districts.length === 0 ? "—" : "Select district"} />
          </SelectTrigger>
          <SelectContent>
            {districts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Locality (optional)</Label>
        <Select
          value={value.localityId ?? undefined}
          onValueChange={(id) => {
            const l = localities.find((x) => x.id === id);
            onChange({
              ...value,
              localityId: id,
              localityName: l?.name ?? null,
            });
          }}
          disabled={!value.districtId || localities.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={localities.length === 0 ? "—" : "Select locality"} />
          </SelectTrigger>
          <SelectContent>
            {localities.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export const emptyGeoSelection: GeoSelection = {
  stateCode: null, stateName: null,
  districtId: null, districtName: null,
  localityId: null, localityName: null,
};

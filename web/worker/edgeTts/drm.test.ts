import { describe, expect, it } from "vitest";
import { secMsGec } from "./drm";

// Эталоны из Python: python3 -c "from edge_tts.drm import generate_sec_ms_gec_v2 as g; print(g(1700000000))"  (edge-tts 7.3.1)
describe("Sec-MS-GEC v2 совпадает с edge-tts (Python)", () => {
  it.each([
    [0, "52BC7A17B50DFEC9-28C4394775C8751CD2F6859C030C06DB1489ACAB3B3A7651831FC26895177ED6"],
    [1700000000, "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"],
    [1763600000.7, "3D8E50674C5F95F2-176A5D5B70925F618CEE5E6A07C46E4878F8A99FCAD2C98A643FBBCA19334955"],
    [1795000123, "6521DCC55F99AAD7-6D04852628E3DF4D0EF33213239BDC3C48750FE37FE5E4591F28C209CE0A3FA2"],
  ])("время %s", (seconds, token) => {
    expect(secMsGec(seconds)).toBe(token);
  });
});

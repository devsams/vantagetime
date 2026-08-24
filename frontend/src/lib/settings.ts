import { AppSettings, CompanyProfile, TeamMember } from "./types";

export function emptyCompanyProfile(): CompanyProfile {
  return { companyName: "", address: "", phone: "", email: "", website: "" };
}

export function emptyTeamMember(id: string): TeamMember {
  return { id, name: "", role: "", email: "", phone: "" };
}

export function emptySettings(): AppSettings {
  return { companyProfile: emptyCompanyProfile(), team: [] };
}

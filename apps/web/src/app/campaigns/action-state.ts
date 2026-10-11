export interface CampaignActionState {
  ok: boolean;
  id?: string;
  code?: string;
  message?: string;
}

export const initialCampaignActionState: CampaignActionState = { ok: false };

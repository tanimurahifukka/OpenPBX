// Lightweight system health summary for nav status dots.
// Called once per page load in the root layout (server component).

import { amiIsReady } from './ami';
import { getCommandRoomConfig, getVoiceBoxConfig } from './settings';

export type StatusLevel = 'ok' | 'warn' | 'off';

export interface SystemStatus {
  ami: StatusLevel;
  commandRoom: StatusLevel;
  voiceBox: StatusLevel;
}

export function getSystemStatus(): SystemStatus {
  const ami: StatusLevel = amiIsReady() ? 'ok' : 'warn';

  const cr = getCommandRoomConfig();
  const commandRoom: StatusLevel = cr.configured ? 'ok' : 'off';

  const vb = getVoiceBoxConfig();
  const voiceBox: StatusLevel = vb.configured ? 'ok' : 'off';

  return { ami, commandRoom, voiceBox };
}

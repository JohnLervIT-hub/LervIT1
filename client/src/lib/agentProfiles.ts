export const AGENT_PROFILES: Record<string, {
  name: string;
  code: string;
  role: string;
  email: string;
  avatar: string;
  color: string;
  gender: 'male' | 'female';
}> = {
  'xavier-cole': {
    name: 'Xavier Cole',
    code: 'APEX',
    role: 'CEO Intelligence Agent',
    email: 'xavier@lervit.com',
    avatar: '/avatars/xavier-cole.png',
    color: '#2563eb',
    gender: 'male',
  },
  'alex-morgan': {
    name: 'Alex Morgan',
    code: 'CLOSER-D',
    role: 'Moving Specialist',
    email: 'alex.morgan@lervit.com',
    avatar: '/avatars/alex-morgan.png',
    color: '#2563eb',
    gender: 'female',
  },
  'scout-reid': {
    name: 'Scout Reid',
    code: 'HUNTER-D',
    role: 'Demand Intelligence',
    email: 'scout@lervit.com',
    avatar: '/avatars/scout-reid.png',
    color: '#f97316',
    gender: 'female',
  },
  'ryan-brooks': {
    name: 'Ryan Brooks',
    code: 'HUNTER-S',
    role: 'Supply Intelligence',
    email: 'ryan@lervit.com',
    avatar: '/avatars/ryan-brooks.png',
    color: '#16a34a',
    gender: 'male',
  },
  'jordan-hayes': {
    name: 'Jordan Hayes',
    code: 'VETTER',
    role: 'Mover Recruitment',
    email: 'jordan.hayes@lervit.com',
    avatar: '/avatars/jordan-hayes.png',
    color: '#16a34a',
    gender: 'male',
  },
  'victor-nash': {
    name: 'Victor Nash',
    code: 'DISPATCH',
    role: 'Job Dispatch',
    email: 'victor@lervit.com',
    avatar: '/avatars/victor-nash.png',
    color: '#2563eb',
    gender: 'male',
  },
  'mark-shaw': {
    name: 'Mark Shaw',
    code: 'PULSE',
    role: 'Operations Monitor',
    email: 'mark@lervit.com',
    avatar: '/avatars/mark-shaw.png',
    color: '#d97706',
    gender: 'male',
  },
  'riley-morgan': {
    name: 'Riley Morgan',
    code: 'ONBOARD',
    role: 'Onboarding Specialist',
    email: 'riley.morgan@lervit.com',
    avatar: '/avatars/riley-morgan.png',
    color: '#16a34a',
    gender: 'female',
  },
  'kai-bennett': {
    name: 'Kai Bennett',
    code: 'RETAIN',
    role: 'Retention Specialist',
    email: 'kai.bennett@lervit.com',
    avatar: '/avatars/kai-bennett.png',
    color: '#7c3aed',
    gender: 'male',
  },
  'sam-carter': {
    name: 'Sam Carter',
    code: 'SALES',
    role: 'B2B Sales',
    email: 'sam.carter@lervit.com',
    avatar: '/avatars/sam-carter.png',
    color: '#059669',
    gender: 'male',
  },
  'nova-clarke': {
    name: 'Nova Clarke',
    code: 'VOICE',
    role: 'Voice Agent',
    email: 'nova.clarke@lervit.com',
    avatar: '/avatars/nova-clarke.png',
    color: '#db2777',
    gender: 'female',
  },
  'ember-lane': {
    name: 'Ember Lane',
    code: 'MAGNET',
    role: 'Content & Marketing',
    email: 'ember.lane@lervit.com',
    avatar: '/avatars/ember-lane.png',
    color: '#ea580c',
    gender: 'female',
  },
  'morgan-price': {
    name: 'Morgan Price',
    code: 'ORACLE',
    role: 'Pricing Intelligence',
    email: 'morgan@lervit.com',
    avatar: '/avatars/morgan-price.png',
    color: '#0891b2',
    gender: 'female',
  },
  'aegis-ford': {
    name: 'Aegis Ford',
    code: 'COMPLIANCE',
    role: 'Compliance Monitor',
    email: 'aegis@lervit.com',
    avatar: '/avatars/aegis-ford.png',
    color: '#475569',
    gender: 'male',
  },
};

export const DEFAULT_AVATAR = (name: string) =>
  `https://api.dicebear.com/7.x/personas/png?seed=${encodeURIComponent(name.replace(/\s+/g, ''))}&size=200`;

export const getAgentAvatar = (agentKey: string): string => {
  const profile = AGENT_PROFILES[agentKey];
  if (!profile) return DEFAULT_AVATAR(agentKey);
  return profile.avatar;
};

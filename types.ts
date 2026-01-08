export const APP_VERSION = '1.0.0';

export interface Contact {
  name: string;
  role: string;
  phone: string;
  colorClass: string;
  initial: string;
  panditId: string;
  photo?: string;
  bio?: string;
  sloka?: {
    sanskrit: string;
    meaning: string;
  };
}

export interface ClientEntry {
  id: number;
  uniqueCode: string;
  clientName: string;
  phone: string;
  gotra?: string;
  arrivalDate?: string;
  departureDate?: string;
  address: string;
  servicePlan: string;
  paymentDetails: string;
  clientPhoto?: string;
  signatureImage: string | null;
  timestamp: number;
}

export interface DivineEvent {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  type: 'arti' | 'festival' | 'katha' | 'other';
  createdBy: string;
  timestamp: number;
}

export type ViewState = 'login' | 'home' | 'add_client' | 'ledger' | 'face_search';

export interface BackgroundImage {
  id: string;
  dataUrl: string;
}
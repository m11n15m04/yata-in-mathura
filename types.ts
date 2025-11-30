export interface Contact {
  name: string;
  role: string;
  phone: string;
  colorClass: string;
  initial: string;
}

export interface ClientEntry {
  id: number;
  uniqueCode: string;
  clientName: string;
  phone: string;
  address: string;
  servicePlan: string;
  paymentDetails: string;
  clientPhoto?: string;
  signatureImage: string | null;
  timestamp: number;
}

export type ViewState = 'home' | 'add_client' | 'ledger' | 'face_search';

export interface BackgroundImage {
  id: string;
  dataUrl: string;
}
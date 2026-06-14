export interface GroundingSource {
  title: string;
  uri: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  base64?: string;
  url?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  attachments?: Attachment[];
  groundingSources?: GroundingSource[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  model: ModelType;
  createdAt: number;
  searchGrounding?: boolean;
}

export type ModelType = 
  | 'gemini-3.5-flash' 
  | 'gemini-3.1-flash-lite'
  | 'models/gemini-2.5-flash-lite';

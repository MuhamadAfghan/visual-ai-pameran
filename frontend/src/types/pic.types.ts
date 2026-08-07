export type PicCamera = { _id: string; name: string; code: string };

export type Pic = {
  _id: string;
  name: string;
  email: string;
  modelTypes: string[];
  subscribedChecks: string[];
  isActive: boolean;
  cameras?: PicCamera[];
  createdAt?: string;
};

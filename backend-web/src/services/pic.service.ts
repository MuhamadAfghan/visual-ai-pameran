import bcrypt from "bcryptjs";
import { PicModel } from "../models/pic.model";
import { UserModel } from "../models/user.model";
import { CameraModel } from "../models/camera.model";

export type PicInput = {
  name: string;
  email: string;
  modelTypes?: string[];
  subscribedChecks?: string[];
  isActive?: boolean;
};

export type PicUpdateInput = Partial<PicInput>;

function buildPassword(name: string, email: string): string {
  const localPart = email.split("@")[0] ?? "";
  return name.slice(0, 3) + localPart.slice(0, 3);
}

export async function listPics() {
  const pics = await PicModel.find().sort({ createdAt: -1 }).lean();
  if (pics.length === 0) return pics;

  const picIds = pics.map((p) => p._id);
  const cameras = await CameraModel.find(
    { defaultPicIds: { $in: picIds } },
    { name: 1, code: 1, defaultPicIds: 1 }
  ).lean();

  const camerasByPic = new Map<string, Array<{ _id: string; name: string; code: string }>>();
  for (const cam of cameras) {
    for (const pid of cam.defaultPicIds ?? []) {
      const key = pid.toString();
      if (!camerasByPic.has(key)) camerasByPic.set(key, []);
      camerasByPic.get(key)!.push({ _id: cam._id.toString(), name: cam.name, code: cam.code });
    }
  }

  return pics.map((p) => ({
    ...p,
    cameras: camerasByPic.get(p._id.toString()) ?? []
  }));
}

export async function getPicById(id: string) {
  return PicModel.findById(id);
}

export async function createPic(input: PicInput) {
  return PicModel.create(input);
}

export async function updatePic(id: string, input: PicUpdateInput) {
  return PicModel.findByIdAndUpdate(id, input, { new: true });
}

export async function deletePic(id: string) {
  return PicModel.findByIdAndDelete(id);
}

export async function createPicWithAccount(
  input: PicInput
): Promise<{ pic: Record<string, unknown>; plainPassword: string }> {
  const plainPassword = buildPassword(input.name, input.email);
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const picDoc = new PicModel(input);
  await picDoc.save();
  const pic = picDoc.toObject() as Record<string, unknown>;

  const user = await UserModel.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: "pic",
    picId: picDoc._id,
    isActive: input.isActive ?? true,
  });

  await PicModel.findByIdAndUpdate(picDoc._id, { userId: user._id });

  return { pic: { ...pic, userId: user._id }, plainPassword };
}

export async function updatePicWithAccount(
  id: string,
  input: PicUpdateInput
): Promise<{ pic: Record<string, unknown> | null; plainPassword?: string }> {
  const picDoc = await PicModel.findByIdAndUpdate(id, input, { new: true });
  if (!picDoc) return { pic: null };

  const pic = picDoc.toObject() as Record<string, unknown>;
  const userId = picDoc.userId?.toString();
  if (!userId) return { pic };

  const userUpdate: Record<string, unknown> = {};
  if (input.name) userUpdate.name = input.name;
  if (input.email) userUpdate.email = input.email;
  if (input.isActive !== undefined) userUpdate.isActive = input.isActive;

  let plainPassword: string | undefined;
  if (input.name || input.email) {
    plainPassword = buildPassword(picDoc.name, picDoc.email);
    userUpdate.passwordHash = await bcrypt.hash(plainPassword, 10);
  }

  await UserModel.findByIdAndUpdate(userId, userUpdate);

  return { pic, plainPassword };
}

export async function deletePicWithAccount(id: string) {
  const pic = await PicModel.findByIdAndDelete(id);
  if (!pic) return null;
  if (pic.userId) {
    await UserModel.findByIdAndDelete(pic.userId);
  }
  return pic;
}

export async function resetPicPassword(id: string): Promise<{ plainPassword: string } | null> {
  const pic = await PicModel.findById(id);
  if (!pic || !pic.userId) return null;

  const plainPassword = buildPassword(pic.name, pic.email);
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  await UserModel.findByIdAndUpdate(pic.userId, { passwordHash });

  return { plainPassword };
}

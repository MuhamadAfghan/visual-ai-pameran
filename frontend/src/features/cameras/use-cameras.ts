import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createCamera,
  updateCamera,
  deleteCamera,
  testCameraConnection,
  type CameraPayload
} from "../../services/camera.service";

export function useCreateCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCamera,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cameras"] })
  });
}

export function useUpdateCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CameraPayload }) =>
      updateCamera(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cameras"] })
  });
}

export function useDeleteCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCamera,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cameras"] })
  });
}

export function useTestCameraConnection() {
  return useMutation({ mutationFn: testCameraConnection });
}

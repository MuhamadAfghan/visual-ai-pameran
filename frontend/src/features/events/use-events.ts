import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getEvents,
  acknowledgeEvent,
  markFalsePositive,
  deleteEvent,
  type EventFilters
} from "../../services/event.service";

export function useEvents(filters: EventFilters) {
  return useQuery({
    queryKey: ["events", filters],
    queryFn: () => getEvents(filters),
    placeholderData: (prev) => prev
  });
}

export function useAcknowledgeEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: acknowledgeEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] })
  });
}

export function useFalsePositiveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markFalsePositive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] })
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events"] })
  });
}

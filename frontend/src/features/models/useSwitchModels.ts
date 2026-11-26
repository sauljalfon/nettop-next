import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSwitchModel,
  deleteSwitchModel,
  switchModels,
  updateSwitchModel,
} from '../../shared/api'
import type { SwitchModel, SwitchModelInput } from '../../shared/types'

export const MODELS_KEY = ['switch-models'] as const

/**
 * The library's switch models (D51), by name. Models are never topology: a
 * save or a delete refetches only this list, never a snapshot or a draft.
 */
export function useSwitchModels() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: MODELS_KEY,
    queryFn: ({ signal }) => switchModels(signal),
  })
  const refetch = () => client.invalidateQueries({ queryKey: MODELS_KEY })
  const create = useMutation({
    mutationFn: (input: SwitchModelInput) => createSwitchModel(input),
    onSuccess: refetch,
  })
  const update = useMutation({
    mutationFn: (v: { id: string; input: SwitchModelInput }) =>
      updateSwitchModel(v.id, v.input),
    onSuccess: refetch,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteSwitchModel(id),
    onSuccess: refetch,
  })
  return {
    models: query.data as SwitchModel[] | undefined,
    loading: query.isPending,
    error: query.error?.message,
    create: create.mutateAsync,
    update: (id: string, input: SwitchModelInput) =>
      update.mutateAsync({ id, input }),
    remove: remove.mutateAsync,
  }
}

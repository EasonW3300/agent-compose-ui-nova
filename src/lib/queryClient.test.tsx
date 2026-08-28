import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { renderWithClient } from '../test/renderWithClient';

function Probe() {
  const { data } = useQuery({
    queryKey: ['probe'],
    queryFn: async () => 'hello',
  });
  return <div>{data ?? 'loading'}</div>;
}

describe('renderWithClient', () => {
  it('把 useQuery 跑起来并渲染数据', async () => {
    renderWithClient(<Probe />);
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument());
  });
});

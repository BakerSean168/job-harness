// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { RecordSidePanelDialog } from '../src/components/ui/record-side-panel-dialog';

afterEach(() => {
  cleanup();
  push.mockReset();
  document.body.innerHTML = '';
});

describe('RecordSidePanelDialog keyboard behavior', () => {
  it('focuses the modal, traps Tab, closes on Escape, and restores prior focus', async () => {
    const previous = document.createElement('button');
    previous.textContent = 'previous';
    document.body.append(previous);
    previous.focus();

    const view = render(
      <RecordSidePanelDialog title="Job detail" closeLabel="Close" closeHref="/jobs">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </RecordSidePanelDialog>,
    );

    const dialog = view.getByRole('dialog', { name: 'Job detail' });
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const close = view.getByRole('link', { name: 'Close' });
    const last = view.getByRole('button', { name: 'Last action' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(push).toHaveBeenCalledWith('/jobs', { scroll: false });

    view.unmount();
    expect(document.activeElement).toBe(previous);
  });
});

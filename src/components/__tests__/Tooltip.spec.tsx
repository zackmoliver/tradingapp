/**
 * Tooltip Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Tooltip from '../ui/Tooltip';

describe('Tooltip Component', () => {
  it('renders tooltip trigger', () => {
    render(<Tooltip content="Test tooltip content" />);
    
    const trigger = screen.getByRole('button', { name: /more information/i });
    expect(trigger).toBeInTheDocument();
  });

  it('shows tooltip on hover', async () => {
    render(<Tooltip content="Test tooltip content" />);
    
    const trigger = screen.getByRole('button', { name: /more information/i });
    
    fireEvent.mouseEnter(trigger);
    
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      expect(screen.getByText('Test tooltip content')).toBeInTheDocument();
    });
  });

  it('hides tooltip on mouse leave', async () => {
    render(<Tooltip content="Test tooltip content" />);
    
    const trigger = screen.getByRole('button', { name: /more information/i });
    
    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
    
    fireEvent.mouseLeave(trigger);
    
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    }, { timeout: 200 });
  });

  it('shows tooltip on focus', async () => {
    render(<Tooltip content="Test tooltip content" />);
    
    const trigger = screen.getByRole('button', { name: /more information/i });
    
    fireEvent.focus(trigger);
    
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });

  it('hides tooltip on blur', async () => {
    render(<Tooltip content="Test tooltip content" />);
    
    const trigger = screen.getByRole('button', { name: /more information/i });
    
    fireEvent.focus(trigger);
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
    
    fireEvent.blur(trigger);
    
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    }, { timeout: 200 });
  });

  it('renders custom children instead of default icon', () => {
    render(
      <Tooltip content="Test tooltip content">
        <span>Custom trigger</span>
      </Tooltip>
    );
    
    expect(screen.getByText('Custom trigger')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Tooltip content="Test tooltip content" className="custom-class" />);
    
    const container = screen.getByRole('button', { name: /more information/i }).parentElement;
    expect(container).toHaveClass('custom-class');
  });
});

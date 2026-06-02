import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from './components';

// Mirrors how POForm builds retailer options: { value, label } only.
const retailerOptions = [
  { value: 'r1', label: 'RETAIL - Best Mattress' },
  { value: 'r2', label: 'RETAIL - Sleep Shoppe' },
  { value: 'r3', label: 'Costco' },
];

// Mirrors how POForm builds product options. The label only shows the alias
// (or product name) plus the master SKU; `keywords` carries master SKU,
// product name, and alias SKU so all three are searchable regardless of label.
const productOptions = [
  {
    value: 'SSGP-QN',
    label: 'HD-ESSENCESSQ → SSGP-QN', // alias → master; product name NOT in label
    keywords: 'SSGP-QN Sapphire Sheets Queen HD-ESSENCESSQ',
  },
  {
    value: 'PIL-STD',
    label: 'Down Pillow Standard → PIL-STD', // no alias; name → master
    keywords: 'PIL-STD Down Pillow Standard Down Pillow Standard',
  },
];

const open = (input) => fireEvent.focus(input);

describe('Combobox', () => {
  it('opens the full list on focus (dropdown still works like a select)', () => {
    render(<Combobox options={retailerOptions} placeholder="ph" onChange={() => {}} />);
    open(screen.getByPlaceholderText('ph'));
    expect(screen.getByText('RETAIL - Best Mattress')).toBeInTheDocument();
    expect(screen.getByText('RETAIL - Sleep Shoppe')).toBeInTheDocument();
    expect(screen.getByText('Costco')).toBeInTheDocument();
  });

  it('filters by case-insensitive substring as you type', async () => {
    const user = userEvent.setup();
    render(<Combobox options={retailerOptions} placeholder="ph" onChange={() => {}} />);
    const input = screen.getByPlaceholderText('ph');
    open(input);
    await user.type(input, 'best');
    expect(screen.getByText('RETAIL - Best Mattress')).toBeInTheDocument();
    expect(screen.queryByText('Costco')).not.toBeInTheDocument();
  });

  it('matches a product by master SKU, alias SKU, or name (via keywords)', async () => {
    const user = userEvent.setup();
    render(<Combobox options={productOptions} placeholder="ph" onChange={() => {}} />);
    const input = screen.getByPlaceholderText('ph');

    // master SKU
    open(input);
    await user.type(input, 'SSGP-QN');
    expect(screen.getByText('HD-ESSENCESSQ → SSGP-QN')).toBeInTheDocument();
    expect(screen.queryByText('Down Pillow Standard → PIL-STD')).not.toBeInTheDocument();

    // alias SKU
    await user.clear(input);
    await user.type(input, 'HD-ESSENCESSQ');
    expect(screen.getByText('HD-ESSENCESSQ → SSGP-QN')).toBeInTheDocument();
    expect(screen.queryByText('Down Pillow Standard → PIL-STD')).not.toBeInTheDocument();

    // product name — present only in keywords, NOT in the visible label
    await user.clear(input);
    await user.type(input, 'sapphire');
    expect(screen.getByText('HD-ESSENCESSQ → SSGP-QN')).toBeInTheDocument();
    expect(screen.queryByText('Down Pillow Standard → PIL-STD')).not.toBeInTheDocument();
  });

  it('calls onChange with the option value when an item is clicked', () => {
    const onChange = vi.fn();
    render(<Combobox options={retailerOptions} placeholder="ph" onChange={onChange} />);
    open(screen.getByPlaceholderText('ph'));
    fireEvent.mouseDown(screen.getByText('RETAIL - Sleep Shoppe'));
    expect(onChange).toHaveBeenCalledWith('r2');
  });

  it('selects the highlighted option with ArrowDown + Enter', () => {
    const onChange = vi.fn();
    render(<Combobox options={retailerOptions} placeholder="ph" onChange={onChange} />);
    const input = screen.getByPlaceholderText('ph');
    open(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // highlight 0 -> 1
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('r2');
  });

  it('shows "No matches" when nothing fits', async () => {
    const user = userEvent.setup();
    render(<Combobox options={retailerOptions} placeholder="ph" onChange={() => {}} />);
    const input = screen.getByPlaceholderText('ph');
    open(input);
    await user.type(input, 'zzzzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.queryByText('Costco')).not.toBeInTheDocument();
  });

  it('shows the selected label after choosing and closes the menu', () => {
    function Harness() {
      const [value, setValue] = useState('');
      return <Combobox options={retailerOptions} placeholder="ph" value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const input = screen.getByPlaceholderText('ph');
    open(input);
    fireEvent.mouseDown(screen.getByText('Costco'));
    expect(input).toHaveValue('Costco');
    // menu closed: other options no longer rendered
    expect(screen.queryByText('RETAIL - Best Mattress')).not.toBeInTheDocument();
  });

  it('closes when clicking outside', () => {
    render(
      <div>
        <Combobox options={retailerOptions} placeholder="ph" onChange={() => {}} />
        <button>outside</button>
      </div>
    );
    open(screen.getByPlaceholderText('ph'));
    expect(screen.getByText('Costco')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByText('Costco')).not.toBeInTheDocument();
  });
});

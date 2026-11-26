import { ColorDot, type AppColor } from '@/ui/data/ColorDot';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/overlays/Popover';
import { ColorChoice } from './ColorChoice';

/** La pastille d'une ligne (type de projet, client, agenda…) : un clic ouvre le choix de la couleur. */
export function ColorButton({ value, onChange, label }: { value: AppColor; onChange: (color: AppColor) => void; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} title={label} className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-hover">
          <ColorDot color={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="px-2 py-1">
        <ColorChoice value={value} onChange={onChange} label={label} />
      </PopoverContent>
    </Popover>
  );
}

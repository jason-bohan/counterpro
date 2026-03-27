declare global {
  interface Window {
    google: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            options?: {
              types?: string[];
              componentRestrictions?: { country: string };
            }
          ) => {
            addListener: (event: string, handler: () => void) => void;
            getPlace: () => {
              formatted_address?: string;
            };
          };
        };
      };
    };
  }
}

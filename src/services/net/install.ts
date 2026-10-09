import { installNetCounter } from './netCounter';

// Imported first in index.js, so the counter is in place before any other module runs.
installNetCounter();

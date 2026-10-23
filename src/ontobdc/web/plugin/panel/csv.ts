import { parseCsv } from '@/ontobdc/shared/adapter/csv';
import { makeFilePanel } from '@/ontobdc/shared/adapter/file-panel';
import { renderTable } from '@/ontobdc/shared/adapter/table';

/**
 * Content of a CSV tab; the Dockview panel id is `csv:<path>`. The first row
 * is the header. Closing the tab publishes `presentation.main.csv.closed` with the path.
 */
export default makeFilePanel({
  prefix: 'csv',
  className: 'csv-panel',
  closedEvent: 'presentation.main.csv.closed',
  render: async (file, element) => {
    element.appendChild(renderTable(parseCsv(await file.text())));
  },
});

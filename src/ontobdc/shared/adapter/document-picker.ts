import { containerDocuments } from '@/ontobdc/shared/adapter/container-documents';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import { createThumbnails, extensionLabel, isImageFile } from '@/ontobdc/shared/adapter/file-thumbnails';
import { createViewToggle } from '@/ontobdc/shared/adapter/view-toggle';
import { translate } from '@/ontobdc/shared/plugin/i18n';

/**
 * Asks the person to choose a file of the container as a document, in a modal
 * over the page with the files of the container and a filter by name, as a list or as thumbnails, as the explorer shows them. It answers
 * the IRI of the chosen document, or null when they cancel, press Escape or
 * close the modal in any other way. The modal is removed once answered.
 *
 * The documents of `preferred` (IRIs, such as the ones the entity already refers to) come first, apart from the rest by
 * a thin line, and are in the list of all the files too.
 */
export async function pickDocument(options: { preferred?: string[] } = {}): Promise<string | null> {
  const folder = ContainerRepository.getInstance().get()?.folder;
  if (!folder) throw new Error('The files of the container cannot be listed: it is not open with write access.');
  const documents = await containerDocuments(folder);
  const preferred = (options.preferred ?? []).flatMap((iri) => documents.filter((candidate) => candidate.iri === iri));

  return new Promise<string | null>((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog document-picker';
    dialog.setAttribute('aria-label', translate('entity.documents.title'));

    const title = document.createElement('h2');
    title.textContent = translate('entity.documents.title');
    const header = document.createElement('div');
    header.className = 'document-picker-header';
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.className = 'entity-editor';
    filter.placeholder = translate('entity.documents.filter');
    filter.setAttribute('aria-label', filter.placeholder);
    const list = document.createElement('ul');
    list.className = 'document-picker-list';
    const thumbnails = createThumbnails();
    const view = createViewToggle({ className: 'view-toggle', thumbs: false, onChange: () => draw() });
    header.append(title, view.element);
    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'confirm-dialog-cancel';
    cancel.textContent = translate('confirm.cancel');
    actions.append(cancel);
    dialog.append(header, filter, list, actions);

    let chosen: string | null = null;
    const draw = (): void => {
      const wanted = filter.value.trim().toLocaleLowerCase();
      const matching = (list: typeof documents): typeof documents => list.filter(({ path }) => path.toLocaleLowerCase().includes(wanted));
      const first = matching(preferred);
      const shown = matching(documents);
      if (shown.length === 0 && first.length === 0) {
        const none = document.createElement('li');
        none.className = 'tree-empty';
        none.textContent = translate('entity.documents.none');
        list.replaceChildren(none);
        return;
      }
      list.classList.toggle('thumbs', view.thumbs());
      const divider = (): HTMLElement => {
        const line = document.createElement('li');
        line.className = 'document-picker-divider';
        line.setAttribute('role', 'separator');
        return line;
      };
      const tile = ({ path, iri }: (typeof documents)[number]): HTMLElement => {
        const item = document.createElement('li');
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.title = path;
        if (view.thumbs()) {
          // A tile, as the explorer draws one: the image when the file is one, else its extension, and the name under it.
          choose.classList.add('thumb');
          const picture = document.createElement('span');
          picture.className = 'thumb-image';
          const name = document.createElement('span');
          name.className = 'thumb-name';
          name.textContent = path.slice(path.lastIndexOf('/') + 1);
          if (isImageFile(path)) thumbnails.show(path, picture);
          else picture.textContent = extensionLabel(path);
          choose.append(picture, name);
        } else {
          choose.textContent = path;
        }
        choose.addEventListener('click', () => { chosen = iri; dialog.close(); });
        item.append(choose);
        return item;
      };
      list.replaceChildren(...first.map(tile), ...(first.length > 0 && shown.length > 0 ? [divider()] : []), ...shown.map(tile));
    };
    draw();
    filter.addEventListener('input', draw);

    dialog.addEventListener('close', () => {
      thumbnails.dispose();
      dialog.remove();
      resolve(chosen);
    });
    cancel.addEventListener('click', () => dialog.close());
    document.body.append(dialog);
    dialog.showModal();
    filter.focus();
  });
}

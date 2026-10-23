export const states = {
  new: ['Принят', 'Сотрудник проверит файл и параметры.'],
  work: ['В работе', 'Сотрудник готовит заказ. Пока можно заняться своими делами.'],
  ready: ['Можно забрать', 'Заказ готов. Чкалова, 11 · оплата безналичная.'],
  issued: ['Выдан', 'Заказ завершён. Спасибо!'],
  attention: ['Нужно уточнение', 'Сотрудник оставил вопрос. Ответь в переписке заказа.'],
  review: [
    'Ответ сохранён',
    'Твой ответ сохранён в прототипе. Следующий шаг — проверка сотрудником.',
  ],
  cancelled: ['Отменён', 'Заказ отменён до начала работы.'],
};
export const blank = () => ({
  fileKey: '',
  fileName: '',
  pages: 0,
  fileSize: 0,
  step: 1,
  format: 'A4',
  color: 'mono',
  duplex: false,
  paper: 'normal',
  copies: 1,
  binding: 'none',
  range: '',
  useRange: false,
  comment: '',
});
export function createCustomerState() {
  return {
    user: null,
    key: '',
    page: 'overview',
    orders: [],
    draft: null,
    profile: null,
    filter: 'active',
    search: '',
    detail: null,
    detailTab: 'info',
    loading: false,
    uploadError: '',
    drawerFocus: null,
    demoState: { design: 'classic', size: 'M', count: 1, text: 'СВОЯ КОМАНДА', color: '#771633' },
    pendingMerch: null,
    merchMode: 'collection',
    sessionId: 0,
  };
}
export function captureSession(state) {
  if (!state.user) throw Error('Сессия завершена. Войди снова и повтори действие.');
  return { owner: state.key, id: state.sessionId };
}
export function sessionCurrent(state, operation) {
  return state.user !== null && state.key === operation.owner && state.sessionId === operation.id;
}
export function checkSession(state, operation) {
  if (!sessionCurrent(state, operation)) throw Error('Сессия изменилась. Операция отменена.');
}

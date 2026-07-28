// Guarda o último payload calculado por este pipeline (disparado por "When
// Executed by Another Workflow") no armazenamento estático do workflow, para
// o webhook do dashboard responder na hora, sem reprocessar SharePoint/SQL
// a cada chamada.
const items = $input.all();
const payload = items[0] ? items[0].json : null;

const staticData = $getWorkflowStaticData('global');
staticData.dashboardPayload = payload;
staticData.dashboardUpdatedAt = new Date().toISOString();

return items;

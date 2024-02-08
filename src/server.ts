import fastify from 'fastify'
import { MemberController } from './member-controller';
import { Member } from "./member";
import minimist from 'minimist'
import { Parser, Quad } from 'n3';
import { MongoStorage } from './mongo-storage';
import { MemoryStorage } from './memory-storage';
import { IStorage } from './storage';
import { NoStorage } from './no-storage';

interface ParsedMember extends Member{
  quads: Quad[];
}

const server = fastify();

const args = minimist(process.argv.slice(2));
const silent: boolean = (/true/i).test(args['silent']);
if (!silent) {
  console.debug("Arguments: ", args);
}

const port = args['port'] || 9000;
const host = args['host'] || 'localhost';
const connectionUri = args['connection-uri'] || 'mongodb://localhost:27017';
const databaseName = args['database-name'] || 'ldes_client_sink';
const collectionName = args['collection-name'] || 'members';
const memberType = args['member-type'];

if (!memberType) {
  exitWithError('missing value for mandatory argument "--member-type".');
}

const useMemoryStorage: boolean = (/true/i).test(args['memory']);
const useNoStorage: boolean = (/true/i).test(args['no-storage']);

if(useMemoryStorage && useNoStorage) {
  exitWithError('you cannot specify to use both "memory" and "no-storage".');
}

const storage: IStorage = 
    useMemoryStorage ? new MemoryStorage(collectionName) 
  : useNoStorage ? new NoStorage()
  : new MongoStorage(connectionUri, databaseName, collectionName);

if(!silent) {
  console.debug('Using storage: ', storage.storageTypeName);
}
const controller = new MemberController(memberType, storage);

server.addHook('onReady', async () => {
  await controller.init();
});

server.addHook('onClose', async () => {
  await controller.dispose();
})

server.addHook('onResponse', (request, reply, done) => {
  if (!silent) {
    const method = request.method;
    const statusCode = reply.statusCode;
    console.info(`[INFO] ${method} ${request.url}${method === 'POST' ? ' ' + request.headers['content-type'] : ''} ${statusCode}`);
  }
  done();
});

server.addContentTypeParser(['application/trig', 'text/turtle', 'application/n-quads', 'application/n-triples'], { parseAs: 'string' }, function (request, body, done) {
  try {
    const contentType = request.headers['content-type'];
    const parser = new Parser({ format: contentType });
    const rdf = parser.parse(body as string);
    const member: ParsedMember = {
      body: body as string,
      contentType: contentType || '',
      quads: rdf,
    }
    done(null, member);
  } catch (error: any) {
    console.error('[ERROR] ', error);
    error.statusCode = 400;
    done(error, undefined);
  }
})

server.get('/', async (_request, reply) => {
  const response = await controller.getIndex();
  reply.send(response);
});

server.post('/member', async (request, reply) => {
  try {
    const member = request.body as ParsedMember;
    const id = await controller.postMember({contentType: member.contentType, body: member.body} as Member, member.quads);
    if (!silent && id) {
      console.info(`[INFO] ingested ${id}`);
    }
    reply.status(id ? 201 : 422).send(id || '');
  } catch (error: any) {
    console.error('[ERROR] ', error);
    reply.status(500);
  }
});

server.get('/member', { schema: { querystring: { id: { type: 'string' } } } }, async (request, reply) => {
  const id = (request.query as { id: string }).id;
  if (id) {
    const member = await controller.getMember(id);
    if (member) {
      reply.header('Content-Type', member.contentType).send(member.body);
    } else {
      reply.status(404).send('');
    }
  }
  else {
    const response = await controller.getMembers();
    reply.send(response);
  }
});

server.delete('/member', async (_request, reply) => {
  const response = await controller.deleteMembers();
  reply.send(response);
});

async function closeGracefully(signal: any) {
  if (!silent) {
    console.debug(`Received signal: `, signal);
  }
  await server.close();
  process.exitCode = 0;
}

process.on('SIGINT', closeGracefully);

function exitWithError(error: any) {
  console.error('[ERROR] ', error);
  process.exit(1);
}

const options = { port: port, host: host };
server.listen(options, async (err: any, address: string) => {
  if (err) {
    exitWithError(err);
  }
  if (!silent) {
    console.debug(`Sink listening at ${address}`);
  }
});

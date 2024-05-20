
docker_build('clickops', '.')

allow_k8s_contexts('default')
allow_k8s_contexts('home-cluster')
default_registry('ttl.sh/clickops')

domain=os.getenv('AUTH_DOMAIN')
if domain == None:
    fail("No domain set: AUTH_DOMAIN is None")

k8s_yaml(['./k8s/sa.yaml', './k8s/role.yaml', './k8s/role-binding.yaml'])

load('ext://helm_resource', 'helm_resource', 'helm_repo')
helm_repo('bjw-s', 'https://bjw-s.github.io/helm-charts/')
helm_resource('clickops', 'bjw-s/app-template', flags=[
    "--values=./k8s/clickops-values.yaml",
    "--set=ingress.app.hosts[0].host=clickops-dev.{}".format(domain),
    "--set=ingress.app.tls[0].hosts[0]=clickops-dev.{}".format(domain),
    "--version=3.1.0",
], image_deps=['clickops'], image_keys=[(
  'controllers.clickops.containers.app.image.repository', 
  'controllers.clickops.containers.app.image.tag')],
deps=[
    './k8s/clickops-values.yaml',
])

# ClickOps

ClickOps is a tool to help you manage your Kubernetes clusters. It is a web-based application that allows you to view and manage your Kubernetes resources.

It assumes that you are using [Flux](https://fluxcd.io/) to manage your cluster. To setup Kubernetes and Flux, checkout [cluster-template](https://github.com/onedr0p/cluster-template).


## Docker
```
docker build -t clickops . 
docker run -v ~/.kube/config:/var/run/secrets/kubernetes.io/serviceaccount/token:ro -p 3000:3000 -it clickops
```

Or use `ghcr.io/whazor/clickops:latest` image.


## Kubernetes / Helm
Via [https://bjw-s.github.io/helm-charts/](https://bjw-s.github.io/helm-charts/)

Download and edit [clickops-values.yaml](./k8s/clickops-values.yaml)

```
helm repo add bjw-s https://bjw-s.github.io/helm-charts/
helm install clickops bjw-s/app-template --values ./clickops-values.yaml
```

Clickops does not provide authentication, so you are required to limit access or add forward authentication via Nginx/Traefik.

### RBAC, don't forget!!

Without the following RBAC resources, the app won't be able to list resources in your cluster.

- [service account](./k8s/sa.yaml)
- [role](./k8s/role.yaml)
- [role binding](./k8s/role-binding.yaml)


## Development

Run the Vite dev server:

```shellscript
pnpm run dev
```

## Deployment

First, build your app for production:

```sh
pnpm run build
```

Then run the app in production mode:

```sh
pnpm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `pnpm run build`

- `build/server`
- `build/client`
